var App = {};

App.urls = {
    issues_root: function(state) {
        return "https://api.github.com/repos/newlif/teams/issues?state=" + state;
    },
    issue_comments: function(number_id) {
        return "https://api.github.com/repos/newlif/teams/issues/" + number_id + "/comments";
    }
};

App.GithubIssuesModel = Backbone.Model.extend({
    urlRoot: "https://api.github.com/repos/newlif/teams/issues",
});

App.GithubIssuesCollection = Backbone.Collection.extend({
    model: App.GithubIssuesModel,
    url: App.urls.issues_root("open"),
    comparator: function(m) {
        var self = this;
        return Date.parse(m.get("milestone").due_on);
    },

    // Parse the data to filter out issues with closed milestones, seems api
    // doesn't support issues filtering on open milestones. Not ideal as gets
    // all data but should work for now.
    parse: function(data) {
        var self = this;
        return _.filter(data, function(issue) { return issue.milestone.state === "open"});
    },

    helper_labels: function(model_items) {
        var self = this;
        // flatten transforms  [[1], [2]] to [1, 2]
        var labels = _.flatten(_.map(model_items, function (item) {
            return item.attributes.labels;
        }));
        return _.sortBy(_.uniq(labels, function(item) { return item.name; }), "name");
    },

    /**
    * Abstracts filtering model by label
    * @params {object} model -  the model instanc the collection
    * @params {string} label - the label to be compared
    * @returns {boolean} - Does model have the labels
    */
    helper_filter_label: function(model, label) {
        var self = this;
        var labels = _.map(_.flatten(model.get("labels")), function(item) {
            return item.name;
        });
        return labels.indexOf(label) !== -1;
    },

    git_labels: function() {
        var self = this;
        return self.helper_labels(self.models);
    },

    getCollectionLabel: function(label) {
        var self = this;
        var filteredCollection = this.filter(function(model) {
            return self.helper_filter_label(model, label);
        });
        return _.map(filteredCollection, function(model) {
            return model.attributes;
        });
    },

    groupByMilestones: function() {
        var self = this,
            models = self.models,

            // Grouping the models by the milestone title
            grouped =  _.groupBy(models, function(model) {
                return model.attributes.milestone.title;
            });

            // Grouping the labels in each milestone by the label title
            new_group = _.map(grouped, function(grouped_models, key) {
                var temp_value,
                    output_dict = {},
                    grouped_label_dict = {},
                    labels = self.git_labels();

                labels = _.sortBy(labels, function(element) {
                    var rank = {
                        "Overview": 1,
                        "Setup": 2,
                        "Welcome": 3
                    };
                    return rank[element.name];
                });

                // For each label filter the models according to the label and add the label as a key
                // to the output dictionary
                _.each(labels, function(label) {
                    var filtered_labels = _.filter(grouped_models, function(model) {
                        return self.helper_filter_label(model, label.name);
                    });

                    if (filtered_labels.length !== 0) {
                        grouped_label_dict[label.name] = filtered_labels;
                    }
                });
                output_dict["milestone"] = key;
                output_dict["data"] = grouped_label_dict;
                return output_dict;
            });
            return new_group;
    }
});

App.GithubCommentsModel = Backbone.Model.extend({
    idAttribute: "id",
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});

App.GithubCommentsCollection = Backbone.Collection.extend({
    model: App.GithubCommentsModel,
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});


App.AppView = Backbone.View.extend({
    el: "#workspace",
    git_comment_collection: undefined,
    events: {
        "click .issues-nav a": "navigateLabelDetail",
        "click .view-issue": "viewIssueComment",
        "click #week-view": "navigateWeek",
        "click #label-view": "navigateLabel"
    },
    initialize: function(options) {
        var self = this;
        _.bindAll(
            self,
            "renderLabels",
            "renderLabelDetail",
            "viewIssueComment",
            "renderComments",
            "gitFetchError");
        self.git_collection = options.git_collection;
        self.issues_template = _.template($("#github-issues-template").html());
        self.comments_template = _.template($("#github-issue-comments-template").html());
        self.milestones_template = _.template($("#github-milestones-template").html());
        return this;
    },

    navigateWeek: function(ev) {
        ev.preventDefault();

        var self = this;
        Backbone.history.navigate("", {trigger: true});
    },

    navigateLabel: function(ev) {
        ev.preventDefault();

        var self = this;
        Backbone.history.navigate("labels/", {trigger: true});
    },

    navigateLabelDetail: function(ev) {
        ev.preventDefault();

        var self = this,
            $element = $(ev.currentTarget),
            label = $element.data("label");

        if (label === "default") {
            Backbone.history.navigate("labels/", {trigger: true});
        } else {
            Backbone.history.navigate("labels/" + label + "/", {trigger: true});
        }

    },

    renderBaseView: function() {
        var self = this,
            milestones = self.git_collection.groupByMilestones();

        self.$("#workspace-items").html("");
        _.each(milestones, function(data, index) {
            var overview_data, $tmpl;

            if (_.has(data.data, "Overview")) {
                overview_data = data.data["Overview"][0].attributes;
                delete data.data["Overview"];
            }
            _.extend(data, {"overview": overview_data});

            $tmpl = $(self.milestones_template(data));

            self.$("#workspace-items").append($tmpl);

        });
    },

    /**
    * Rendering the main workspace view and populating labels. Also renders
    * overall issues
    */
    renderLabels: function() {
        var self = this,
            labels = self.git_collection.git_labels();

        self.$("#workspace-items").html(self.issues_template({
            issues: self.git_collection.toJSON(),
            labels: labels
        }));
    },

    renderLabelDetail: function(label) {
        var self = this,
            labels = self.git_collection.git_labels();

        self.$("#issue-nav li").removeClass("active");

        if (label === "default") {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.toJSON(),
                labels: labels
            }));
        } else {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.getCollectionLabel(label),
                labels: labels
            }));
        }
        // $element.addClass("active");
    },

    viewIssueComment: function(ev) {
        var self = this, $element;
        ev.preventDefault();
        $element = $(ev.currentTarget);
        self.git_comment_collection = new App.GithubCommentsCollection({
            url: $element.data("comments-url")
        });
        self.git_comment_collection.fetch({
            success: self.renderComments,
            error: self.gitFetchError
        });
    },

    renderComments: function() {
        var self = this, comments;
        comments = self.git_comment_collection.toJSON();
        _.each(comments, function(comment) {
            var issue = self.git_collection.findWhere({
                url: comment.issue_url
            });

            if (issue) {
                comment.issue_title = issue.attributes.title;
            }
        });

        self.$("#workspace-items").html(self.comments_template({comments: comments}));
    },

    gitFetchError: function(response, options, status) {
        var self = this;
        console.error(response, options);
    },
    getIssueTitleForComments: function(comments_url) {
        var self = this;
    },
});

App.AppRouter = Backbone.Router.extend({
    routes: {
        "": "renderBaseView",
        "labels/": "renderLabels",
        "labels/:label/": "renderLabelDetail"
    },
    initialize: function(options) {
        var self = this;
        self.collection_fetched = undefined;
        self.git_collection = new App.GithubIssuesCollection();
        self.fetch_collection = self.git_collection.fetch();

        self.app = new App.AppView({
            git_collection: self.git_collection
        });
    },

    renderBaseView: function() {
        var self = this;

        if (self.collection_fetched) {
            self.app.renderBaseView();
        } else {
            self.fetch_collection.done(function() {
                self.app.renderBaseView();
                self.collection_fetched = true;
            });
        }
    },

    renderLabels: function() {
        var self = this;

        if (self.collection_fetched) {
            self.app.renderLabels();
        } else {
            self.fetch_collection.done(function() {
                self.app.renderLabels();
                self.collection_fetched = true;
            });
        }
    },

    renderLabelDetail: function(label) {
        var self = this;

        if (self.collection_fetched) {
            self.app.renderLabelDetail(label);
        } else {
            self.fetch_collection.done(function() {
                self.app.renderLabelDetail(label);
                self.collection_fetched = true;
            });
        }
    }
});


$(document).ready(function() {
    // new App.AppView({});
    new App.AppRouter({});
    Backbone.history.start({pushstate: true});
});
